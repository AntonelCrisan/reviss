"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { LanguagePreference } from "@/lib/auth-api";

// Keys of messages/*.json, e.g. "marketing.hero.badge".
export type TranslationKey = Parameters<ReturnType<typeof useTranslations<never>>>[0];

type LanguageContextValue = {
  language: LanguagePreference;
  setLanguage: (language: LanguagePreference) => void;
  t: (key: TranslationKey) => string;
};

const STORAGE_KEY = "reviss-language";
const LANGUAGE_EVENT = "reviss-language-change";
const languages: LanguagePreference[] = ["ro", "en", "fr"];
const LanguageContext = createContext<LanguageContextValue | null>(null);

function isLanguagePreference(
  value: string | null | undefined,
): value is LanguagePreference {
  return languages.includes(value as LanguagePreference);
}

function getStoredLanguage(): LanguagePreference {
  if (typeof window === "undefined") {
    return "ro";
  }

  try {
    const storedLanguage = window.localStorage.getItem(STORAGE_KEY);
    return isLanguagePreference(storedLanguage) ? storedLanguage : "ro";
  } catch {
    return "ro";
  }
}

// Read by the backend (through the API proxies, which forward cookies) so
// errors and emails come back in the language the visitor is looking at,
// including flows without an account yet: register, password reset, contact.
const LANGUAGE_COOKIE_NAME = "reviss-language";
const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function applyLanguage(language: LanguagePreference) {
  document.documentElement.lang = language;
  document.documentElement.dataset.language = language;
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LANGUAGE_COOKIE_NAME}=${language}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  } catch {
    // Cookies can be blocked; the backend then falls back to Accept-Language.
  }
}

/** Whether the cookie the server reads now carries this language. */
function hasLanguageCookie(language: LanguagePreference) {
  try {
    return document.cookie
      .split(";")
      .some((part) => part.trim() === `${LANGUAGE_COOKIE_NAME}=${language}`);
  } catch {
    return false;
  }
}

function getLanguageSnapshot(): LanguagePreference {
  if (typeof document === "undefined") {
    return "ro";
  }

  const domLanguage = document.documentElement.dataset.language;
  return isLanguagePreference(domLanguage) ? domLanguage : getStoredLanguage();
}

function subscribe(callback: () => void) {
  applyLanguage(getStoredLanguage());

  function handleLanguageChange() {
    callback();
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY) return;
    applyLanguage(getStoredLanguage());
    callback();
  }

  window.addEventListener(LANGUAGE_EVENT, handleLanguageChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(LANGUAGE_EVENT, handleLanguageChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // The locale the server rendered this page in (from the cookie).
  const serverLocale = useLocale();
  const translate = useTranslations();
  const language = useSyncExternalStore<LanguagePreference>(
    subscribe,
    getLanguageSnapshot,
    () => serverLocale as LanguagePreference,
  );
  const syncedRef = useRef(false);

  const setLanguage = useCallback(
    (nextLanguage: LanguagePreference) => {
      applyLanguage(nextLanguage);

      try {
        window.localStorage.setItem(STORAGE_KEY, nextLanguage);
      } catch {
        // The language still changes for the current page.
      }

      window.dispatchEvent(new Event(LANGUAGE_EVENT));

      // Server-rendered text (next-intl) only changes with a new render in
      // the new locale; the cookie must have been written for that to work,
      // otherwise the refresh would come back in the same language forever.
      if (nextLanguage !== serverLocale && hasLanguageCookie(nextLanguage)) {
        router.refresh();
      }
    },
    [router, serverLocale],
  );

  // A visitor who chose a language before the cookie existed still has it in
  // localStorage only: bring the server in line once.
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    const stored = getStoredLanguage();
    if (stored !== serverLocale) {
      setLanguage(stored);
    }
  }, [serverLocale, setLanguage]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key) => translate(key),
    }),
    [language, setLanguage, translate],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider.");
  }

  return context;
}

export const languageOptions = languages.map((language) => ({
  value: language,
  labelKey: `language.${language}` as TranslationKey,
}));
