import type { Metadata } from "next";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { AuthProvider } from "@/components/auth/auth-provider";
import { LanguageProvider } from "@/components/language-provider";
import { GlobalNotificationBell } from "@/components/global-notification-bell";
import { AccountTopBarPresenceProvider } from "@/components/account/account-topbar-presence";
import { CookieConsentProvider } from "@/components/legal/cookie-consent";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastCenter } from "@/components/toast-center";
import { VisitorPing } from "@/components/visitor-ping";
import {
  defaultLocale,
  openGraphImagePath,
  siteName,
  siteUrl,
} from "@/lib/seo";
import {
  colorThemePresets,
  defaultColorSchemeId,
  themeColorVariables,
} from "@/lib/theme-colors";
import "./globals.css";

const themeScript = `
(() => {
  try {
    const presets = ${JSON.stringify(colorThemePresets)};
    const variables = ${JSON.stringify(
      themeColorVariables.map((variable) => ({
        key: variable.key,
        cssVar: variable.cssVar,
      })),
    )};
    const stored = localStorage.getItem("revizzio-theme");
    const preference =
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "system";
    const isDark =
      preference === "dark" ||
      (preference === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    const root = document.documentElement;
    const storedColorScheme = localStorage.getItem("revizzio-color-scheme");
    const colorScheme = presets.some((preset) => preset.id === storedColorScheme)
      ? storedColorScheme
      : "${defaultColorSchemeId}";
    const preset =
      presets.find((currentPreset) => currentPreset.id === colorScheme) ||
      presets[0];
    let customColors = {};

    try {
      customColors = JSON.parse(
        localStorage.getItem("revizzio-custom-colors") || "{}",
      );
    } catch {
      customColors = {};
    }

    root.dataset.theme = isDark ? "dark" : "light";
    root.dataset.themePreference = preference;
    root.dataset.colorScheme = colorScheme;
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
    const favicon = document.querySelector('link[data-reviss-favicon]');
    if (favicon) {
      favicon.setAttribute(
        "href",
        isDark
          ? "/assets/logos/Reviss_favicon_light.svg"
          : "/assets/logos/Reviss_favicon_dark.svg",
      );
    }

    const colors = {
      ...preset.colors[isDark ? "dark" : "light"],
      ...customColors,
    };

    variables.forEach((variable) => {
      if (typeof colors[variable.key] === "string") {
        root.style.setProperty(variable.cssVar, colors[variable.key]);
      }
    });
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

const languageScript = `
(() => {
  document.documentElement.dataset.language = document.documentElement.lang || "ro";
})();
`;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seo");
  const title = t("title");
  const description = t("description");

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: title,
      template: `%s | ${siteName}`,
    },
    description: description,
    applicationName: siteName,
    category: "education",
    creator: siteName,
    publisher: siteName,
    keywords: t("keywords").split(", "),
    alternates: {
      canonical: "/",
    },
    formatDetection: {
      telephone: false,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    icons: {
      icon: [
        // Stable, theme-independent URLs for crawlers and older browsers.
        { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
        { url: "/favicon-48x48.png", type: "image/png", sizes: "48x48" },
        {
          url: "/assets/logos/Reviss_favicon_dark.svg",
          type: "image/svg+xml",
          media: "(prefers-color-scheme: light)",
        },
        {
          url: "/assets/logos/Reviss_favicon_light.svg",
          type: "image/svg+xml",
          media: "(prefers-color-scheme: dark)",
        },
      ],
    },
    openGraph: {
      title: title,
      description: description,
      url: "/",
      siteName,
      locale: defaultLocale,
      type: "website",
      images: [
        {
          url: openGraphImagePath,
          width: 1200,
          height: 630,
          alt: t("ogAlt"),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: title,
      description: description,
      images: [openGraphImagePath],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // From the language cookie (or Accept-Language): the page is served in
  // the visitor's language instead of being rewritten after hydration.
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        <link
          data-reviss-favicon
          rel="icon"
          href="/assets/logos/Reviss_favicon_dark.svg"
          type="image/svg+xml"
        />
        <Script
          id="reviss-theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        <Script
          id="reviss-language-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: languageScript }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <VisitorPing />
        <NextIntlClientProvider>
          <ThemeProvider>
            <CookieConsentProvider>
              <LanguageProvider>
                <AuthProvider>
                  <AccountTopBarPresenceProvider>
                    <GlobalNotificationBell />
                    {children}
                  </AccountTopBarPresenceProvider>
                </AuthProvider>
              </LanguageProvider>
            </CookieConsentProvider>
          </ThemeProvider>
          {/*
            Last in the body and outside the app's own providers: the toast
            viewport is `fixed` and reads its cards from a plain module store,
            so it needs no theme, language or session context. It stays inside
            NextIntlClientProvider because the card itself is localised, and a
            toast can be raised from anywhere in the app.
          */}
          <ToastCenter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
