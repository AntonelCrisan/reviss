import { defaultLocale, isLocale, LANGUAGE_COOKIE_NAME, type Locale } from "@/i18n/config";

/**
 * The UI language on the client, from the cookie the language switcher
 * writes. Used by API helpers for the rare fallback messages that do not come
 * from the backend (network failures, non-JSON upstream errors); everything
 * else is already localised by next-intl or by the backend.
 */
export function currentClientLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  try {
    const cookieValue = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${LANGUAGE_COOKIE_NAME}=`))
      ?.slice(LANGUAGE_COOKIE_NAME.length + 1);
    if (isLocale(cookieValue)) return cookieValue;
    const htmlLang = document.documentElement.lang;
    if (isLocale(htmlLang)) return htmlLang;
  } catch {
    // Cookies can be blocked; fall through to the default.
  }
  return defaultLocale;
}

export function localizedFallback(messages: Record<Locale, string>): string {
  return messages[currentClientLocale()];
}

export function genericErrorFallback(): string {
  return localizedFallback({
    ro: "A apărut o eroare. Te rugăm să încerci din nou.",
    en: "Something went wrong. Please try again.",
    fr: "Une erreur est survenue. Réessaie, s'il te plaît.",
  });
}
