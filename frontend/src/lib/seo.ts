import type { Metadata } from "next";

const fallbackSiteUrl = "https://www.reviss.app";

function normalizeSiteUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname === "0.0.0.0") {
      return fallbackSiteUrl;
    }
    return url.origin;
  } catch {
    return fallbackSiteUrl;
  }
}

export const siteName = "Reviss";
export const siteUrl = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL ?? fallbackSiteUrl,
);
export const defaultLocale = "ro_RO";
export const openGraphImagePath = "/opengraph-image";

export const defaultSeoTitle =
  "Reviss | Platformă AI pentru rezumate, flashcard-uri și quiz-uri";
export const defaultSeoDescription =
  "Reviss ajută studenții să transforme cursuri, PDF-uri, documente și prezentări în rezumate clare, flashcard-uri, quiz-uri și planuri de învățare.";

export const seoKeywords = [
  "Reviss",
  "rezumate AI",
  "rezumate AI pentru studenți",
  "rezumat PDF",
  "generator rezumat PDF",
  "flashcard-uri AI",
  "flashcard-uri din cursuri",
  "generator flashcarduri",
  "quiz-uri pentru examen",
  "quiz-uri din cursuri",
  "învățare activă",
  "repetiție inteligentă",
  "pregătire examen",
  "pregătire examen facultate",
  "aplicație de studiu",
  "platformă educațională AI",
  "instrumente AI pentru studenți",
  "organizare cursuri facultate",
  "învățare cu flashcarduri",
  "simulare examen",
];

export const publicSitemapRoutes = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/abonamente", changeFrequency: "weekly", priority: 0.9 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.55 },
  {
    path: "/termeni-si-conditii",
    changeFrequency: "monthly",
    priority: 0.35,
  },
  {
    path: "/politica-de-confidentialitate",
    changeFrequency: "monthly",
    priority: 0.35,
  },
  { path: "/politica-cookies", changeFrequency: "monthly", priority: 0.3 },
  {
    path: "/retragere-din-contract",
    changeFrequency: "monthly",
    priority: 0.25,
  },
  { path: "/raporteaza-continut", changeFrequency: "monthly", priority: 0.25 },
] as const;

export const robotsDisallowRoutes = [
  "/admin/",
  "/api/",
  "/checkout/",
  "/myaccount/",
  "/settings/",
  // Requires a session and mirrors /abonamente, which is the indexable
  // pricing page. Covers /upgrade/facturi too.
  "/upgrade",
];

export const noIndexRobots: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
  },
};

/** Public, indexable route for a single subscription plan. */
export const plansIndexPath = "/abonamente";

export function planDetailPath(slug: string) {
  return `${plansIndexPath}/${slug}`;
}

export function absoluteUrl(path: string) {
  return new URL(path, siteUrl).toString();
}

/**
 * JSON-LD is dropped into a <script> tag verbatim, and JSON.stringify leaves
 * "<" alone -- so a "</script>" inside a plan name or description would end
 * the tag early. Escaping "<" keeps the payload valid JSON and inert HTML.
 */
export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
