export type LegalDocumentSlug = "terms_conditions" | "privacy_policy";

export type CompanyData = {
  id: string;
  name: string;
  social_location: string;
  cui: string;
  register_number: string;
  social_capital: string;
  email: string;
  privacy_email: string;
  phone: string;
  ai_provider: string;
  payment_provider: string;
  hosting_provider: string;
  social_facebook_url: string;
  social_instagram_url: string;
  social_tiktok_url: string;
  social_linkedin_url: string;
  social_youtube_url: string;
  social_x_url: string;
  last_date_modified: string;
};

export type LegalDocumentSection = {
  id: string;
  section_key: string;
  title: string;
  content: string;
  rendered_content: string;
  sort_order: number;
  last_date_modified: string;
};

/** Romanian is the authoritative version; the rest are translations. */
export type LegalLocale = "ro" | "en" | "fr";

export type LegalDocument = {
  id: string;
  slug: LegalDocumentSlug;
  /** The language actually served, which may be the Romanian fallback. */
  locale: LegalLocale;
  /** True when this is a translation, so the page can flag which text binds. */
  is_translation: boolean;
  title: string;
  content_html: string;
  rendered_content_html: string;
  last_date_modified: string;
  sections: LegalDocumentSection[];
  available_variables: string[];
};

export type LegalSectionUpdate = {
  title: string;
  content: string;
};

export type LegalSectionCreate = LegalSectionUpdate;

export type CompanyDataUpdate = Omit<CompanyData, "id" | "last_date_modified">;

type ApiErrorPayload = {
  detail?: unknown;
};

type ApiValidationIssue = {
  loc?: Array<string | number>;
  msg?: string;
  type?: string;
};

const legalFieldLabels: Record<string, string> = {
  name: "Denumire firmă",
  social_location: "Sediu social",
  cui: "CUI",
  register_number: "Nr. Registrul Comerțului",
  social_capital: "Capital social",
  email: "E-mail contact",
  privacy_email: "E-mail confidențialitate",
  phone: "Telefon",
  ai_provider: "Furnizor AI",
  payment_provider: "Furnizor plăți",
  hosting_provider: "Furnizor hosting",
  social_facebook_url: "Facebook",
  social_instagram_url: "Instagram",
  social_tiktok_url: "TikTok",
  social_linkedin_url: "LinkedIn",
  social_youtube_url: "YouTube",
  social_x_url: "X (Twitter)",
};

export class LegalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LegalApiError";
  }
}

function isApiValidationIssue(value: unknown): value is ApiValidationIssue {
  return (
    typeof value === "object" &&
    value !== null &&
    ("msg" in value || "loc" in value)
  );
}

function issueFieldLabel(issue: ApiValidationIssue) {
  const fieldName = issue.loc
    ?.map(String)
    .filter((part) => !["body", "query", "path"].includes(part))
    .at(-1);

  return fieldName ? legalFieldLabels[fieldName] || fieldName : "Formular";
}

function friendlyValidationMessage(issue: ApiValidationIssue) {
  const rawMessage = issue.msg || "valoarea nu este validă";
  const normalizedMessage = rawMessage.toLowerCase();

  if (
    normalizedMessage.includes("field required") ||
    normalizedMessage.includes("at least 1 character")
  ) {
    return `${issueFieldLabel(issue)} este obligatoriu.`;
  }
  if (normalizedMessage.includes("valid email address")) {
    return `${issueFieldLabel(issue)} trebuie să fie o adresă de e-mail validă.`;
  }
  if (normalizedMessage.includes("at most")) {
    return `${issueFieldLabel(issue)} este prea lung.`;
  }

  return `${issueFieldLabel(issue)}: ${rawMessage}`;
}

function apiErrorMessage(payload: ApiErrorPayload, status: number) {
  const { detail } = payload;
  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }
  if (Array.isArray(detail)) {
    const issueMessages = detail
      .filter(isApiValidationIssue)
      .map(friendlyValidationMessage);

    if (issueMessages.length > 0) {
      const visibleMessages = issueMessages.slice(0, 4).join(" ");
      const overflowMessage =
        issueMessages.length > 4
          ? ` Mai există ${issueMessages.length - 4} erori în formular.`
          : "";
      return `Verifică formularul. ${visibleMessages}${overflowMessage}`;
    }
  }
  if (
    typeof detail === "object" &&
    detail !== null &&
    "message" in detail &&
    typeof detail.message === "string" &&
    detail.message.trim()
  ) {
    return detail.message.trim();
  }

  if (status === 401) return "Sesiunea a expirat. Autentifică-te din nou.";
  if (status === 403) return "Nu ai acces să modifici datele firmei.";
  if (status === 422) return "Verifică formularul. Unele câmpuri nu sunt valide.";
  if (status >= 500) return "Serverul nu a putut procesa salvarea momentan.";
  return "Solicitarea nu a putut fi procesată.";
}

async function legalRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/legal/${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.clone().json()) as ApiErrorPayload;
    } catch {
      try {
        const text = await response.text();
        if (text.trim()) {
          throw new LegalApiError(text.trim().slice(0, 300), response.status);
        }
      } catch (error) {
        if (error instanceof LegalApiError) throw error;
      }
    }
    throw new LegalApiError(apiErrorMessage(payload, response.status), response.status);
  }

  return (await response.json()) as T;
}

function localeQuery(locale: LegalLocale) {
  return `?locale=${encodeURIComponent(locale)}`;
}

export function getAdminLegalDocument(
  slug: LegalDocumentSlug,
  locale: LegalLocale = "ro",
): Promise<LegalDocument> {
  return legalRequest<LegalDocument>(
    `admin/documents/${slug}${localeQuery(locale)}`,
  );
}

export function updateAdminLegalDocumentSection(
  slug: LegalDocumentSlug,
  sectionKey: string,
  payload: LegalSectionUpdate,
  locale: LegalLocale = "ro",
): Promise<LegalDocument> {
  return legalRequest<LegalDocument>(
    `admin/documents/${slug}/sections/${sectionKey}${localeQuery(locale)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export function createAdminLegalDocumentSection(
  slug: LegalDocumentSlug,
  payload: LegalSectionCreate,
  locale: LegalLocale = "ro",
): Promise<LegalDocument> {
  return legalRequest<LegalDocument>(
    `admin/documents/${slug}/sections${localeQuery(locale)}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function deleteAdminLegalDocumentSection(
  slug: LegalDocumentSlug,
  sectionKey: string,
  locale: LegalLocale = "ro",
): Promise<LegalDocument> {
  return legalRequest<LegalDocument>(
    `admin/documents/${slug}/sections/${sectionKey}${localeQuery(locale)}`,
    {
      method: "DELETE",
    },
  );
}

export function getAdminCompanyData(): Promise<CompanyData> {
  return legalRequest<CompanyData>("admin/company-data");
}

export function updateAdminCompanyData(
  payload: CompanyDataUpdate,
): Promise<CompanyData> {
  return legalRequest<CompanyData>("admin/company-data", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
