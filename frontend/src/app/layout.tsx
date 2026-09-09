import type { Metadata } from "next";
import Script from "next/script";
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
  defaultSeoDescription,
  defaultSeoTitle,
  openGraphImagePath,
  seoKeywords,
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
  try {
    const stored = localStorage.getItem("reviss-language");
    const language = stored === "en" || stored === "fr" || stored === "ro"
      ? stored
      : "ro";
    document.documentElement.lang = language;
    document.documentElement.dataset.language = language;
  } catch {
    document.documentElement.lang = "ro";
  }
})();
`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: defaultSeoTitle,
    template: `%s | ${siteName}`,
  },
  description: defaultSeoDescription,
  applicationName: siteName,
  category: "education",
  creator: siteName,
  publisher: siteName,
  keywords: seoKeywords,
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
    title: defaultSeoTitle,
    description: defaultSeoDescription,
    url: "/",
    siteName,
    locale: defaultLocale,
    type: "website",
    images: [
      {
        url: openGraphImagePath,
        width: 1200,
        height: 630,
        alt: "Reviss - platformă AI pentru studiu activ",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultSeoTitle,
    description: defaultSeoDescription,
    images: [openGraphImagePath],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ro"
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
          Outside every provider and last in the body: the toast viewport is
          `fixed`, and it reads its messages from a plain module store rather
          than a context, so it needs no ancestor other than the body itself.
        */}
        <ToastCenter />
      </body>
    </html>
  );
}
