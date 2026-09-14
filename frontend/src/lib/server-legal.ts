import "server-only";

import { cookies, headers } from "next/headers";
import {
  acceptLanguageHeader,
  languageCookieHeader,
} from "@/lib/server-language";
import { legalConfig } from "@/lib/legal-config";
import type { CompanyData, LegalDocument, LegalDocumentSlug } from "@/lib/legal-api";

export const availableCompanyVariables = [
  "{last_date_modified}",
  "{company_name}",
  "{name}",
  "{social_location}",
  "{cui}",
  "{register_number}",
  "{social_capital}",
  "{email}",
  "{privacy_email}",
  "{phone}",
  "{ai_provider}",
  "{payment_provider}",
  "{hosting_provider}",
];

function apiUrl() {
  return process.env.API_URL;
}

async function requestHeaders(includeAuth: boolean) {
  const requestHeaders = new Headers();
  const requestHeadersFromNext = await headers();
  const userAgent = requestHeadersFromNext.get("user-agent");

  if (includeAuth) {
    const cookieHeader =
      requestHeadersFromNext.get("cookie") ?? (await cookies()).toString();
    if (cookieHeader) {
      requestHeaders.set("cookie", cookieHeader);
    }
  } else {
    // Public endpoints get the language cookie only, never the session: the
    // backend picks the response language from it, and without it every
    // server-rendered page would answer in Romanian whatever the visitor chose.
    const languageCookie = await languageCookieHeader();
    if (languageCookie) {
      requestHeaders.set("cookie", languageCookie);
    }
  }

  const acceptLanguage = await acceptLanguageHeader();
  if (acceptLanguage) {
    requestHeaders.set("accept-language", acceptLanguage);
  }

  if (userAgent) {
    requestHeaders.set("user-agent", userAgent);
  }

  return requestHeaders;
}

async function serverLegalRequest<T>(
  path: string,
  options: { includeAuth?: boolean } = {},
): Promise<T | null> {
  const baseUrl = apiUrl();
  if (!baseUrl) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}/api/legal/${path}`, {
      method: "GET",
      headers: await requestHeaders(Boolean(options.includeAuth)),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function getServerLegalDocument(
  slug: LegalDocumentSlug,
): Promise<LegalDocument | null> {
  return serverLegalRequest<LegalDocument>(`documents/${slug}`);
}

export function getServerAdminLegalDocument(
  slug: LegalDocumentSlug,
): Promise<LegalDocument | null> {
  return serverLegalRequest<LegalDocument>(`admin/documents/${slug}`, {
    includeAuth: true,
  });
}

export function getServerCompanyData(): Promise<CompanyData | null> {
  return serverLegalRequest<CompanyData>("company-data");
}

export function getFallbackCompanyData(): CompanyData {
  return {
    id: "fallback",
    name: legalConfig.companyName,
    social_location: legalConfig.registeredOffice,
    cui: legalConfig.cui,
    register_number: legalConfig.tradeRegisterNumber,
    social_capital: legalConfig.shareCapital,
    email: legalConfig.contactEmail,
    privacy_email: legalConfig.privacyEmail,
    phone: legalConfig.phone,
    ai_provider: legalConfig.aiProvider,
    payment_provider: legalConfig.paymentProvider,
    hosting_provider: legalConfig.hostingProvider,
    social_facebook_url: "",
    social_instagram_url: "",
    social_tiktok_url: "",
    social_linkedin_url: "",
    social_youtube_url: "",
    social_x_url: "",
    last_date_modified: new Date(0).toISOString(),
  };
}

export function createFallbackLegalDocument(
  slug: LegalDocumentSlug,
  title: string,
  contentHtml: string,
): LegalDocument {
  const timestamp = new Date(0).toISOString();

  return {
    id: "fallback",
    slug,
    // The bundled copy is the Romanian original, so it never carries the
    // notice that a translation is non-binding.
    locale: "ro",
    is_translation: false,
    title,
    content_html: contentHtml,
    rendered_content_html: contentHtml,
    last_date_modified: timestamp,
    sections: [
      {
        id: "fallback-main",
        section_key: "main",
        title,
        content: contentHtml,
        rendered_content: contentHtml,
        sort_order: 0,
        last_date_modified: timestamp,
      },
    ],
    available_variables: availableCompanyVariables,
  };
}
