"use client";

import { useTranslations } from "next-intl";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CompanyData } from "@/lib/legal-api";
import { toast } from "@/lib/toast-store";
import { socialPlatforms } from "@/components/legal/social-icons";

type FormState =
  | { status: "idle"; message: null; registrationNumber?: never }
  | { status: "submitting"; message: null; registrationNumber?: never }
  | { status: "success"; message: string; registrationNumber?: string }
  | { status: "error"; message: string; registrationNumber?: never };

type FormFieldErrors = Partial<Record<string, string>>;

const initialState: FormState = { status: "idle", message: null };

type ComplianceTranslator = ReturnType<typeof useTranslations<"compliance">>;
type ComplianceKey = Parameters<ComplianceTranslator>[0];

const contactFieldInputClassName =
  "h-11 w-full rounded-lg border border-subtle bg-app px-3 text-sm font-semibold text-content outline-none transition placeholder:text-muted/45 focus:border-action focus:ring-4 focus:ring-action-soft";

const contactFieldTextareaClassName =
  "min-h-36 w-full resize-y rounded-lg border border-subtle bg-app px-3 py-3 text-sm font-semibold leading-6 text-content outline-none transition placeholder:text-muted/45 focus:border-action focus:ring-4 focus:ring-action-soft";

const clientRecaptchaSiteKey =
  process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() ?? "";
const contentReportAllowedAttachmentExtensions = [
  ".doc",
  ".docx",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".rtf",
  ".txt",
  ".webp",
];
const contentReportMaxAttachmentFiles = 5;
const contentReportMaxAttachmentBytes = 10 * 1024 * 1024;

type SelectedContentReportAttachment = {
  id: string;
  file: File;
};

class ComplianceRequestError extends Error {
  fieldErrors: FormFieldErrors;

  constructor(message: string, fieldErrors: FormFieldErrors = {}) {
    super(message);
    this.name = "ComplianceRequestError";
    this.fieldErrors = fieldErrors;
  }
}

type RecaptchaClient = {
  ready?: (callback: () => void) => void;
  render: (
    container: HTMLElement,
    parameters: { sitekey: string; theme?: "light" | "dark" },
  ) => number;
  getResponse: (widgetId?: number) => string;
  reset: (widgetId?: number) => void;
};

declare global {
  interface Window {
    grecaptcha?: RecaptchaClient;
  }
}

async function postComplianceForm(
  t: ComplianceTranslator,
  endpoint: string,
  payload: object,
) {
  const response = await fetch(`/api/compliance/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Reviss-Form-Intent": endpoint,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    registration_number?: string;
    detail?: unknown;
  };

  if (!response.ok) {
    throw new ComplianceRequestError(
      readApiError(t, body.detail, response.status),
      readApiFieldErrors(t, body.detail),
    );
  }

  return body;
}

async function postComplianceMultipart(
  t: ComplianceTranslator,
  endpoint: string,
  payload: FormData,
) {
  const response = await fetch(`/api/compliance/${endpoint}`, {
    method: "POST",
    headers: {
      "X-Reviss-Form-Intent": endpoint,
    },
    body: payload,
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    registration_number?: string;
    detail?: unknown;
  };

  if (!response.ok) {
    throw new ComplianceRequestError(
      readApiError(t, body.detail, response.status),
      readApiFieldErrors(t, body.detail),
    );
  }

  return body;
}

type ApiValidationError = {
  loc?: unknown;
  msg?: unknown;
  type?: unknown;
  ctx?: unknown;
};

const apiErrorFieldLabelKeys: Record<string, ComplianceKey> = {
  attachments: "documente",
  category: "categorie",
  content_reference: "continut",
  declaration: "declaratie",
  description: "descriere",
  email: "eMail",
  full_name: "numeComplet",
  form: "formular",
  message: "mesaj",
  name: "nume",
  order_number: "numarulComenzii",
  recaptcha_token: "verificareAntiSpam",
  reason: "motiv",
  report_type: "tip",
  rights_evidence: "dovezi",
  subject: "subiect",
  subscription_or_order: "abonamentSauComanda",
};

const apiErrorFieldNames: Record<string, string> = {
  attachments: "attachments",
  category: "category",
  content_reference: "contentReference",
  declaration: "declaration",
  description: "description",
  email: "email",
  full_name: "fullName",
  message: "message",
  name: "name",
  order_number: "orderNumber",
  reason: "reason",
  report_type: "reportType",
  rights_evidence: "rightsEvidence",
  subject: "subject",
  subscription_or_order: "subscription",
};

function readApiError(
  t: ComplianceTranslator,
  detail: unknown,
  statusCode?: number,
) {
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => readValidationErrorItem(t, item))
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(" ");
    }
  }

  if (detail && typeof detail === "object") {
    const message = readValidationErrorItem(t, detail);
    if (message) return message;
  }

  if (statusCode === 400) {
    return t("verificaFormularulSiIncearcaDin");
  }
  if (statusCode === 403) {
    return t("solicitareaAFostBlocataDin");
  }
  if (statusCode === 422) {
    return t("verificaDateleDinFormularUnele");
  }
  if (statusCode === 429) {
    return t("aiTrimisPreaMulteSolicitari");
  }
  if (statusCode && statusCode >= 500) {
    return t("serverulNuPoateProcesaSolicitarea");
  }

  return t("solicitareaNuAPututFi");
}

function readApiFieldErrors(
  t: ComplianceTranslator,
  detail: unknown,
): FormFieldErrors {
  if (!Array.isArray(detail)) {
    return {};
  }

  return detail.reduce<FormFieldErrors>((fieldErrors, item) => {
    if (!item || typeof item !== "object") {
      return fieldErrors;
    }

    const error = item as ApiValidationError;
    const fieldName = readValidationFieldName(error.loc);
    const message = readValidationErrorItem(t, error);
    if (fieldName && message) {
      fieldErrors[fieldName] = message;
    }
    return fieldErrors;
  }, {});
}

function readValidationErrorItem(t: ComplianceTranslator, item: unknown) {
  if (typeof item === "string" && item.trim()) {
    return item.trim();
  }
  if (!item || typeof item !== "object") {
    return null;
  }

  const error = item as ApiValidationError;
  const rawType = typeof error.type === "string" ? error.type : "";
  const rawMessage =
    typeof error.msg === "string" ? error.msg : t("valoareInvalida");
  const message = normalizeApiErrorMessage(rawMessage);
  const fieldLabel = readValidationFieldLabel(t, error.loc);
  const fieldName = readValidationFieldName(error.loc);
  const prefix = fieldLabel ? `${fieldLabel}: ` : "";
  const context =
    error.ctx && typeof error.ctx === "object"
      ? (error.ctx as Record<string, unknown>)
      : {};
  const lowerMessage = message.toLowerCase();

  if (rawType === "missing") {
    return t("prefixCampObligatoriuLipsa", { prefix });
  }

  if (rawType === "string_too_short") {
    const minLength = Number(context.min_length);
    return Number.isFinite(minLength)
      ? t("prefixTrebuieSaAibaCel", { prefix, minLength })
      : t("prefixTextulEstePreaScurt", { prefix });
  }

  if (rawType === "string_too_long") {
    const maxLength = Number(context.max_length);
    return Number.isFinite(maxLength)
      ? t("prefixTrebuieSaAibaCel2", { prefix, maxLength })
      : t("prefixTextulEstePreaLung", { prefix });
  }

  if (
    rawType.includes("email") ||
    lowerMessage.includes("email address") ||
    lowerMessage.includes("valid email")
  ) {
    return t("valueAdresaDeEMail", { value: prefix || "E-mail: " });
  }

  if (rawType === "literal_error") {
    return t("prefixAlegeOOptiuneValida", { prefix });
  }

  if (rawType.includes("bool") && fieldName === "declaration") {
    return t("declaratieConfirmareaEsteObligatorie");
  }

  return `${prefix}${message}`;
}

function readValidationFieldLabel(t: ComplianceTranslator, loc: unknown) {
  if (!Array.isArray(loc)) return null;

  for (let index = loc.length - 1; index >= 0; index -= 1) {
    const segment = loc[index];
    if (typeof segment !== "string") continue;
    if (["body", "query", "path"].includes(segment)) continue;
    const labelKey = apiErrorFieldLabelKeys[segment];
    return labelKey ? t(labelKey) : segment.replace(/_/g, " ");
  }

  return null;
}

function readValidationFieldName(loc: unknown) {
  if (!Array.isArray(loc)) return null;

  for (let index = loc.length - 1; index >= 0; index -= 1) {
    const segment = loc[index];
    if (typeof segment !== "string") continue;
    if (["body", "query", "path"].includes(segment)) continue;
    return apiErrorFieldNames[segment] ?? null;
  }

  return null;
}

function normalizeApiErrorMessage(message: string) {
  return message
    .replace(/^Value error,\s*/i, "")
    .replace(/^Input should be\s*/i, "")
    .trim();
}

function formValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function hasFieldErrors(fieldErrors: FormFieldErrors) {
  return Object.values(fieldErrors).some(Boolean);
}

function clearFieldError(
  setFieldErrors: React.Dispatch<React.SetStateAction<FormFieldErrors>>,
  fieldName: string,
) {
  setFieldErrors((currentErrors) => {
    if (!currentErrors[fieldName]) return currentErrors;
    const nextErrors = { ...currentErrors };
    delete nextErrors[fieldName];
    return nextErrors;
  });
}

function fieldClassName(baseClassName: string, error?: string) {
  if (!error) return baseClassName;
  return `${baseClassName} border-danger-border ring-2 ring-danger-soft`;
}

function validateRequiredText(
  t: ComplianceTranslator,
  value: string,
  {
    empty,
    minLength,
    min,
    maxLength,
    max,
  }: {
    empty: string;
    minLength?: number;
    min?: string;
    maxLength?: number;
    max?: string;
  },
) {
  if (!value) return empty;
  if (minLength !== undefined && value.length < minLength) {
    return min ?? t("introduCelPutinMinlengthCaractere", { minLength });
  }
  if (maxLength !== undefined && value.length > maxLength) {
    return max ?? t("introduCelMultMaxlengthCaractere", { maxLength });
  }
  return null;
}

function validateOptionalText(
  value: string,
  { maxLength, max }: { maxLength: number; max: string },
) {
  if (value && value.length > maxLength) return max;
  return null;
}

function validateEmail(t: ComplianceTranslator, value: string) {
  if (!value) return t("introduAdresaDeEMail");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value)) {
    return t("introduOAdresaDeE");
  }
  return null;
}

function validateContactFields(
  t: ComplianceTranslator,
  formData: FormData,
): FormFieldErrors {
  const errors: FormFieldErrors = {};
  const name = formValue(formData, "name");
  const email = formValue(formData, "email");
  const category = formValue(formData, "category");
  const subject = formValue(formData, "subject");
  const message = formValue(formData, "message");

  errors.name =
    validateRequiredText(t, name, {
      empty: t("introduNumeleTau"),
      minLength: 2,
      min: t("numeleTrebuieSaAibaCel"),
      maxLength: 120,
      max: t("numelePoateAveaCelMult"),
    }) ?? undefined;
  errors.email = validateEmail(t, email) ?? undefined;
  errors.category = category ? undefined : t("alegeCategoriaMesajului");
  errors.subject =
    validateRequiredText(t, subject, {
      empty: t("introduSubiectulMesajului"),
      minLength: 3,
      min: t("subiectulTrebuieSaAibaCel"),
      maxLength: 160,
      max: t("subiectulPoateAveaCelMult"),
    }) ?? undefined;
  errors.message =
    validateRequiredText(t, message, {
      empty: t("scrieMesajul"),
      minLength: 10,
      min: t("mesajulTrebuieSaAibaCel"),
      maxLength: 5000,
      max: t("mesajulPoateAveaCelMult"),
    }) ?? undefined;

  return errors;
}

function validateWithdrawalFields(
  t: ComplianceTranslator,
  formData: FormData,
): FormFieldErrors {
  const errors: FormFieldErrors = {};
  const fullName = formValue(formData, "fullName");
  const email = formValue(formData, "email");
  const subscription = formValue(formData, "subscription");
  const orderNumber = formValue(formData, "orderNumber");
  const reason = formValue(formData, "reason");

  errors.fullName =
    validateRequiredText(t, fullName, {
      empty: t("introduNumeleComplet"),
      minLength: 2,
      min: t("numeleCompletTrebuieSaAiba"),
      maxLength: 120,
      max: t("numeleCompletPoateAveaCel"),
    }) ?? undefined;
  errors.email = validateEmail(t, email) ?? undefined;
  errors.subscription =
    validateRequiredText(t, subscription, {
      empty: t("introduAbonamentulSauComandaVizata"),
      minLength: 2,
      min: t("abonamentulSauComandaTrebuieSa"),
      maxLength: 160,
      max: t("abonamentulSauComandaPoateAvea"),
    }) ?? undefined;
  errors.orderNumber =
    validateOptionalText(orderNumber, {
      maxLength: 80,
      max: t("numarulComenziiPoateAveaCel"),
    }) ?? undefined;
  errors.reason =
    validateOptionalText(reason, {
      maxLength: 5000,
      max: t("motivulPoateAveaCelMult"),
    }) ?? undefined;
  errors.confirmation =
    formData.get("confirmation") === "on"
      ? undefined
      : t("confirmaSolicitareaDeRetragereInainte");

  return errors;
}

function validateContentReportFields(
  t: ComplianceTranslator,
  formData: FormData,
  attachmentFiles: File[],
): FormFieldErrors {
  const errors: FormFieldErrors = {};
  const name = formValue(formData, "name");
  const email = formValue(formData, "email");
  const reportType = formValue(formData, "reportType");
  const contentReference = formValue(formData, "contentReference");
  const description = formValue(formData, "description");
  const rightsEvidence = formValue(formData, "rightsEvidence");

  errors.name =
    validateRequiredText(t, name, {
      empty: t("introduNumeleTau"),
      minLength: 2,
      min: t("numeleTrebuieSaAibaCel"),
      maxLength: 120,
      max: t("numelePoateAveaCelMult"),
    }) ?? undefined;
  errors.email = validateEmail(t, email) ?? undefined;
  errors.reportType = reportType ? undefined : t("alegeTipulSesizarii");
  errors.contentReference =
    validateRequiredText(t, contentReference, {
      empty: t("adaugaLinkulSauIdentificatorulContinutul"),
      minLength: 3,
      min: t("continutulTrebuieSaAibaCel"),
      maxLength: 400,
      max: t("continutulPoateAveaCelMult"),
    }) ?? undefined;
  errors.description =
    validateRequiredText(t, description, {
      empty: t("descrieProblemaRaportata"),
      minLength: 10,
      min: t("descriereaTrebuieSaAibaCel"),
      maxLength: 5000,
      max: t("descriereaPoateAveaCelMult"),
    }) ?? undefined;
  errors.rightsEvidence =
    validateOptionalText(rightsEvidence, {
      maxLength: 5000,
      max: t("dovezilePotAveaCelMult"),
    }) ?? undefined;
  errors.declaration =
    formData.get("declaration") === "on"
      ? undefined
      : t("confirmaDeclaratiaPrivindCorectitudineaI");
  errors.attachments =
    validateContentReportAttachments(t, attachmentFiles) ?? undefined;

  return errors;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;

  return (
    <span
      id={id}
      role="alert"
      className="mt-2 block text-xs font-bold leading-5 text-danger"
    >
      {message}
    </span>
  );
}

/**
 * Mirrors a form's outcome into the toast centre.
 *
 * Every `setState` builds a fresh object, so resubmitting into the same error
 * re-runs this and the store restarts that card's countdown instead of
 * stacking a duplicate.
 */
function useFormStateToast(state: FormState) {
  const t = useTranslations("compliance");
  useEffect(() => {
    if (state.status === "success") {
      toast.success(
        state.message,
        state.registrationNumber
          ? t("numarDeInregistrareRegistrationnumber", { registrationNumber: state.registrationNumber })
          : undefined,
      );
      return;
    }

    if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state, t]);
}

function ContactFormRow({
  label,
  description,
  children,
  isLast = false,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <label
      className={`grid min-w-0 gap-3 px-5 py-4 md:grid-cols-[12rem_minmax(0,1fr)] md:items-center ${
        isLast ? "" : "border-b border-subtle"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-muted">
          {label}
        </span>
        <span className="mt-1 hidden text-xs text-muted md:block">
          {description}
        </span>
      </span>
      {children}
    </label>
  );
}

function ContactRecaptcha({
  siteKey,
  isResolvingConfig,
  containerRef,
  isReady,
  error,
  onScriptLoad,
  onScriptError,
}: {
  siteKey: string;
  isResolvingConfig: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isReady: boolean;
  error: string | null;
  onScriptLoad: () => void;
  onScriptError: () => void;
}) {
  const t = useTranslations("compliance");
  if (!siteKey) {
    return (
      <div className="rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm font-semibold leading-6 text-warning">
        {isResolvingConfig
          ? t("seVerificaSetarileRecaptcha")
          : t("recaptchaNuEsteConfiguratPe")}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-subtle bg-surface p-5">
      <div className="grid gap-3 md:grid-cols-[12rem_minmax(0,1fr)] md:items-center">
        <span className="min-w-0">
          <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-muted">
            {t("verificare")}
          </span>
          <span className="mt-1 hidden text-xs text-muted md:block">
            {t("protectieAntiSpam")}
          </span>
        </span>
        <div className="min-w-0">
          <Script
            src="https://www.google.com/recaptcha/api.js?render=explicit"
            strategy="afterInteractive"
            onLoad={onScriptLoad}
            onError={onScriptError}
          />
          <div className="min-h-[78px] overflow-hidden rounded-lg border border-subtle bg-app px-3 py-3">
            <div className="w-[304px] max-w-full origin-top-left scale-[0.9] sm:scale-100">
              <div ref={containerRef} />
            </div>
          </div>
          {!isReady || error ? (
            <span
              className={`mt-2 block text-xs font-bold leading-5 ${
                error ? "text-danger" : "text-muted"
              }`}
            >
              {error ?? t("seIncarcaVerificareaAntiSpam")}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function validateContentReportAttachments(
  t: ComplianceTranslator,
  files: File[],
) {
  if (files.length > contentReportMaxAttachmentFiles) {
    return t("potiAtasaCelMultContentreportmaxattachme", { contentReportMaxAttachmentFiles });
  }

  for (const file of files) {
    const lowerName = file.name.toLowerCase();
    const isAllowedExtension = contentReportAllowedAttachmentExtensions.some(
      (extension) => lowerName.endsWith(extension),
    );
    if (!isAllowedExtension) {
      return t("ataseazaDoarPdfDocDocx");
    }
    if (file.size > contentReportMaxAttachmentBytes) {
      return t("documentulNameDepasesteLimitaDe", { name: file.name });
    }
  }

  return null;
}

/**
 * Whether an error message is about the uploaded documents.
 *
 * Both this form and the backend word attachment errors around the same
 * few terms, so the catalogue carries the per-language tokens instead of
 * this file hard-coding the Romanian ones.
 */
function isAttachmentErrorMessage(t: ComplianceTranslator, message: string) {
  const normalizedMessage = message.toLowerCase();
  return t("attachmentErrorTokens")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .some((token) => normalizedMessage.includes(token));
}

function formatContentReportFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function useRecaptcha(configuredSiteKey: string) {
  const t = useTranslations("compliance");
  const initialRecaptchaSiteKey =
    configuredSiteKey.trim() || clientRecaptchaSiteKey;
  const [runtimeRecaptchaSiteKey, setRuntimeRecaptchaSiteKey] = useState("");
  const [
    hasCheckedRuntimeRecaptchaConfig,
    setHasCheckedRuntimeRecaptchaConfig,
  ] = useState(Boolean(initialRecaptchaSiteKey));
  const effectiveRecaptchaSiteKey =
    initialRecaptchaSiteKey || runtimeRecaptchaSiteKey;
  const isResolvingRecaptchaConfig =
    !initialRecaptchaSiteKey && !hasCheckedRuntimeRecaptchaConfig;
  const isRecaptchaMissing =
    hasCheckedRuntimeRecaptchaConfig && !effectiveRecaptchaSiteKey;
  const [isRecaptchaReady, setIsRecaptchaReady] = useState(
    !effectiveRecaptchaSiteKey,
  );
  const [recaptchaError, setRecaptchaError] = useState<string | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaWidgetIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialRecaptchaSiteKey || hasCheckedRuntimeRecaptchaConfig) {
      return undefined;
    }

    let isCancelled = false;

    async function loadRuntimeConfig() {
      try {
        const response = await fetch("/api/public-config", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          recaptcha_site_key?: string;
        };
        if (!isCancelled) {
          setRuntimeRecaptchaSiteKey(data.recaptcha_site_key?.trim() || "");
        }
      } catch {
        if (!isCancelled) {
          setRuntimeRecaptchaSiteKey("");
        }
      } finally {
        if (!isCancelled) {
          setHasCheckedRuntimeRecaptchaConfig(true);
        }
      }
    }

    void loadRuntimeConfig();

    return () => {
      isCancelled = true;
    };
  }, [hasCheckedRuntimeRecaptchaConfig, initialRecaptchaSiteKey]);

  const renderRecaptcha = useCallback(() => {
    if (!effectiveRecaptchaSiteKey) {
      setIsRecaptchaReady(true);
      return;
    }
    if (
      !recaptchaContainerRef.current ||
      !window.grecaptcha ||
      recaptchaWidgetIdRef.current !== null
    ) {
      return;
    }

    const renderWidget = () => {
      if (
        !recaptchaContainerRef.current ||
        !window.grecaptcha ||
        recaptchaWidgetIdRef.current !== null
      ) {
        return;
      }

      try {
        recaptchaWidgetIdRef.current = window.grecaptcha.render(
          recaptchaContainerRef.current,
          { sitekey: effectiveRecaptchaSiteKey },
        );
        setIsRecaptchaReady(true);
        setRecaptchaError(null);
      } catch {
        setIsRecaptchaReady(false);
        setRecaptchaError(
          t("recaptchaNuSAPutut"),
        );
      }
    };

    if (window.grecaptcha.ready) {
      window.grecaptcha.ready(renderWidget);
    } else {
      renderWidget();
    }
  }, [effectiveRecaptchaSiteKey, t]);

  useEffect(() => {
    if (!effectiveRecaptchaSiteKey) {
      return undefined;
    }

    const tryRenderRecaptcha = () => {
      if (recaptchaWidgetIdRef.current === null) {
        setIsRecaptchaReady(false);
        setRecaptchaError(null);
      }
      renderRecaptcha();
      if (recaptchaWidgetIdRef.current !== null) {
        window.clearInterval(retryTimer);
      }
    };
    const initialTimer = window.setTimeout(tryRenderRecaptcha, 0);
    const retryTimer = window.setInterval(tryRenderRecaptcha, 500);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(retryTimer);
    };
  }, [effectiveRecaptchaSiteKey, renderRecaptcha]);

  const resetRecaptcha = useCallback(() => {
    if (!effectiveRecaptchaSiteKey || !window.grecaptcha) return;
    window.grecaptcha.reset(recaptchaWidgetIdRef.current ?? undefined);
  }, [effectiveRecaptchaSiteKey]);

  const getRecaptchaToken = useCallback(() => {
    if (!effectiveRecaptchaSiteKey) return "";
    return (
      window.grecaptcha?.getResponse(
        recaptchaWidgetIdRef.current ?? undefined,
      ) ?? ""
    );
  }, [effectiveRecaptchaSiteKey]);

  const markScriptError = useCallback(() => {
    setIsRecaptchaReady(false);
    setRecaptchaError(t("scriptulRecaptchaNuSA"));
  }, [t]);

  return {
    siteKey: effectiveRecaptchaSiteKey,
    isResolvingConfig: isResolvingRecaptchaConfig,
    isMissing: isRecaptchaMissing,
    isReady: isRecaptchaReady,
    error: recaptchaError,
    containerRef: recaptchaContainerRef,
    render: renderRecaptcha,
    reset: resetRecaptcha,
    getToken: getRecaptchaToken,
    markScriptError,
  };
}

type ContactFormProps = {
  recaptchaSiteKey: string;
};

export function ContactForm({ recaptchaSiteKey }: ContactFormProps) {
  const t = useTranslations("compliance");
  const recaptcha = useRecaptcha(recaptchaSiteKey);
  const [state, setState] = useState<FormState>(initialState);
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const [isContactSubmitting, setIsContactSubmitting] = useState(false);
  const isSubmitButtonDisabled =
    isContactSubmitting ||
    recaptcha.isMissing ||
    Boolean(recaptcha.siteKey && recaptcha.error);

  useFormStateToast(state);

  function handleAnotherMessage() {
    setIsContactSubmitting(false);
    setFieldErrors({});
    setState(initialState);
    recaptcha.reset();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isContactSubmitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const nextFieldErrors = validateContactFields(t, formData);
    if (hasFieldErrors(nextFieldErrors)) {
      setFieldErrors(nextFieldErrors);
      setState({
        status: "error",
        message: t("corecteazaCampurileMarcateInainteDe"),
      });
      return;
    }
    setFieldErrors({});

    if (recaptcha.isMissing) {
      setState({
        status: "error",
        message:
          t("recaptchaNuEsteConfiguratPe2"),
      });
      return;
    }

    if (recaptcha.error) {
      setState({
        status: "error",
        message: recaptcha.error,
      });
      return;
    }

    if (!recaptcha.isReady) {
      setState({
        status: "error",
        message: t("protectiaAntiSpamIncaSe"),
      });
      return;
    }

    const recaptchaToken = recaptcha.siteKey ? recaptcha.getToken() : "";

    if (recaptcha.siteKey && !recaptchaToken) {
      setState({
        status: "error",
        message: t("confirmaVerificareaAntiSpamInainte"),
      });
      return;
    }

    setIsContactSubmitting(true);
    setState({ status: "submitting", message: null });
    try {
      const response = await postComplianceForm(t, "contact", {
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        subject: String(formData.get("subject") ?? ""),
        message: String(formData.get("message") ?? ""),
        category: String(formData.get("category") ?? ""),
        recaptcha_token: recaptchaToken,
      });
      form.reset();
      recaptcha.reset();
      setFieldErrors({});
      setState({
        status: "success",
        message:
          response.message ||
          t("mesajulAFostTrimisIti"),
        registrationNumber: response.registration_number,
      });
    } catch (error) {
      const serverFieldErrors =
        error instanceof ComplianceRequestError ? error.fieldErrors : {};
      if (hasFieldErrors(serverFieldErrors)) {
        setFieldErrors(serverFieldErrors);
      }
      setState({
        status: "error",
        message:
          hasFieldErrors(serverFieldErrors)
            ? t("corecteazaCampurileMarcateInainteDe")
            : error instanceof Error
              ? error.message
              : t("mesajulNuAPututFi"),
      });
      recaptcha.reset();
    } finally {
      setIsContactSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
      <div className="rounded-xl border border-subtle bg-surface">
        <ContactFormRow
          label={t("nume")}
          description={t("cumTePutemIdentifica")}
        >
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            placeholder={t("numeleTau")}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "contact-name-error" : undefined}
            onInput={() => clearFieldError(setFieldErrors, "name")}
            className={fieldClassName(
              contactFieldInputClassName,
              fieldErrors.name,
            )}
          />
          <FieldError id="contact-name-error" message={fieldErrors.name} />
        </ContactFormRow>
        <ContactFormRow
          label="E-mail"
          description={t("aiciItiTrimitemRaspunsul")}
        >
          <input
            name="email"
            required
            type="email"
            placeholder="nume@email.ro"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={
              fieldErrors.email ? "contact-email-error" : undefined
            }
            onInput={() => clearFieldError(setFieldErrors, "email")}
            className={fieldClassName(
              contactFieldInputClassName,
              fieldErrors.email,
            )}
          />
          <FieldError id="contact-email-error" message={fieldErrors.email} />
        </ContactFormRow>
        <ContactFormRow
          label={t("categorie")}
          description={t("directionamMesajulCorect")}
        >
          <select
            name="category"
            required
            aria-invalid={Boolean(fieldErrors.category)}
            aria-describedby={
              fieldErrors.category ? "contact-category-error" : undefined
            }
            onChange={() => clearFieldError(setFieldErrors, "category")}
            className={fieldClassName(
              contactFieldInputClassName,
              fieldErrors.category,
            )}
          >
            <option value="">{t("alegeCategoria")}</option>
            <option value="suport">{t("suport")}</option>
            <option value="facturare">{t("facturare")}</option>
            <option value="confidentialitate">{t("confidentialitate")}</option>
            <option value="raportare_continut">{t("raportareContinut")}</option>
          </select>
          <FieldError
            id="contact-category-error"
            message={fieldErrors.category}
          />
        </ContactFormRow>
        <ContactFormRow
          label={t("subiect")}
          description={t("peScurtDespreCeEste")}
        >
          <input
            name="subject"
            required
            minLength={3}
            maxLength={160}
            placeholder="Ex: Ajutor cu abonamentul"
            aria-invalid={Boolean(fieldErrors.subject)}
            aria-describedby={
              fieldErrors.subject ? "contact-subject-error" : undefined
            }
            onInput={() => clearFieldError(setFieldErrors, "subject")}
            className={fieldClassName(
              contactFieldInputClassName,
              fieldErrors.subject,
            )}
          />
          <FieldError
            id="contact-subject-error"
            message={fieldErrors.subject}
          />
        </ContactFormRow>
        <ContactFormRow
          label={t("mesaj")}
          description={t("includeDetaliileUtile")}
          isLast
        >
          <textarea
            name="message"
            required
            minLength={10}
            maxLength={5000}
            placeholder={t("scrieMesajulAici")}
            aria-invalid={Boolean(fieldErrors.message)}
            aria-describedby={
              fieldErrors.message ? "contact-message-error" : undefined
            }
            onInput={() => clearFieldError(setFieldErrors, "message")}
            className={fieldClassName(
              contactFieldTextareaClassName,
              fieldErrors.message,
            )}
          />
          <FieldError id="contact-message-error" message={fieldErrors.message} />
        </ContactFormRow>
      </div>
      <ContactRecaptcha
        siteKey={recaptcha.siteKey}
        isResolvingConfig={recaptcha.isResolvingConfig}
        containerRef={recaptcha.containerRef}
        isReady={recaptcha.isReady}
        error={recaptcha.error}
        onScriptLoad={recaptcha.render}
        onScriptError={recaptcha.markScriptError}
      />
      {state.status === "success" ? (
        <button
          key="contact-success-action"
          type="button"
          onClick={handleAnotherMessage}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover sm:w-fit"
        >
          {t("trimiteAltMesaj")}
        </button>
      ) : (
        <button
          key="contact-submit-action"
          type="submit"
          disabled={isSubmitButtonDisabled}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60 sm:w-fit"
        >
          {isContactSubmitting ? t("seTrimite") : t("trimiteMesajul")}
        </button>
      )}
    </form>
  );
}

type WithdrawalFormProps = {
  recaptchaSiteKey: string;
};

export function WithdrawalForm({ recaptchaSiteKey }: WithdrawalFormProps) {
  const t = useTranslations("compliance");
  const recaptcha = useRecaptcha(recaptchaSiteKey);
  const [state, setState] = useState<FormState>(initialState);
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const [isWithdrawalSubmitting, setIsWithdrawalSubmitting] = useState(false);
  const isSubmitButtonDisabled =
    isWithdrawalSubmitting ||
    recaptcha.isMissing ||
    Boolean(recaptcha.siteKey && recaptcha.error);

  useFormStateToast(state);

  function handleAnotherWithdrawal() {
    setIsWithdrawalSubmitting(false);
    setFieldErrors({});
    setState(initialState);
    recaptcha.reset();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isWithdrawalSubmitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const nextFieldErrors = validateWithdrawalFields(t, formData);
    if (hasFieldErrors(nextFieldErrors)) {
      setFieldErrors(nextFieldErrors);
      setState({
        status: "error",
        message: t("corecteazaCampurileMarcateInainteDe"),
      });
      return;
    }
    setFieldErrors({});

    if (recaptcha.isMissing) {
      setState({
        status: "error",
        message:
          t("recaptchaNuEsteConfiguratPe2"),
      });
      return;
    }

    if (recaptcha.error) {
      setState({
        status: "error",
        message: recaptcha.error,
      });
      return;
    }

    if (!recaptcha.isReady) {
      setState({
        status: "error",
        message: t("protectiaAntiSpamIncaSe"),
      });
      return;
    }

    const recaptchaToken = recaptcha.siteKey ? recaptcha.getToken() : "";

    if (recaptcha.siteKey && !recaptchaToken) {
      setState({
        status: "error",
        message: t("confirmaVerificareaAntiSpamInainte"),
      });
      return;
    }

    setIsWithdrawalSubmitting(true);
    setState({ status: "submitting", message: null });
    try {
      const response = await postComplianceForm(t, "withdrawal", {
        full_name: String(formData.get("fullName") ?? ""),
        email: String(formData.get("email") ?? ""),
        subscription_or_order: String(formData.get("subscription") ?? ""),
        order_number: String(formData.get("orderNumber") ?? ""),
        reason: String(formData.get("reason") ?? ""),
        confirmation: true,
        recaptcha_token: recaptchaToken,
      });
      form.reset();
      recaptcha.reset();
      setFieldErrors({});
      setState({
        status: "success",
        message:
          response.message ||
          t("solicitareaDeRetragereAFost"),
        registrationNumber: response.registration_number,
      });
    } catch (error) {
      const serverFieldErrors =
        error instanceof ComplianceRequestError ? error.fieldErrors : {};
      if (hasFieldErrors(serverFieldErrors)) {
        setFieldErrors(serverFieldErrors);
      }
      setState({
        status: "error",
        message:
          hasFieldErrors(serverFieldErrors)
            ? t("corecteazaCampurileMarcateInainteDe")
            : error instanceof Error
              ? error.message
              : t("solicitareaNuAPututFi"),
      });
      recaptcha.reset();
    } finally {
      setIsWithdrawalSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
      <div className="rounded-xl border border-subtle bg-surface">
        <ContactFormRow
          label={t("numeComplet")}
          description={t("cumApareInContSau")}
        >
          <input
            name="fullName"
            required
            minLength={2}
            maxLength={120}
            placeholder={t("numeleTauComplet")}
            aria-invalid={Boolean(fieldErrors.fullName)}
            aria-describedby={
              fieldErrors.fullName ? "withdrawal-full-name-error" : undefined
            }
            onInput={() => clearFieldError(setFieldErrors, "fullName")}
            className={fieldClassName(
              contactFieldInputClassName,
              fieldErrors.fullName,
            )}
          />
          <FieldError
            id="withdrawal-full-name-error"
            message={fieldErrors.fullName}
          />
        </ContactFormRow>
        <ContactFormRow
          label="E-mail"
          description={t("adresaAsociataContului")}
        >
          <input
            name="email"
            required
            type="email"
            placeholder="nume@email.ro"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={
              fieldErrors.email ? "withdrawal-email-error" : undefined
            }
            onInput={() => clearFieldError(setFieldErrors, "email")}
            className={fieldClassName(
              contactFieldInputClassName,
              fieldErrors.email,
            )}
          />
          <FieldError id="withdrawal-email-error" message={fieldErrors.email} />
        </ContactFormRow>
        <ContactFormRow
          label={t("abonament")}
          description={t("planulSauComandaVizata")}
        >
          <input
            name="subscription"
            required
            minLength={2}
            maxLength={160}
            placeholder="Ex: Focus lunar"
            aria-invalid={Boolean(fieldErrors.subscription)}
            aria-describedby={
              fieldErrors.subscription
                ? "withdrawal-subscription-error"
                : undefined
            }
            onInput={() => clearFieldError(setFieldErrors, "subscription")}
            className={fieldClassName(
              contactFieldInputClassName,
              fieldErrors.subscription,
            )}
          />
          <FieldError
            id="withdrawal-subscription-error"
            message={fieldErrors.subscription}
          />
        </ContactFormRow>
        <ContactFormRow
          label={t("comanda")}
          description={t("optionalDacaExista")}
        >
          <input
            name="orderNumber"
            maxLength={80}
            placeholder={t("numarComandaSauFactura")}
            aria-invalid={Boolean(fieldErrors.orderNumber)}
            aria-describedby={
              fieldErrors.orderNumber ? "withdrawal-order-error" : undefined
            }
            onInput={() => clearFieldError(setFieldErrors, "orderNumber")}
            className={fieldClassName(
              contactFieldInputClassName,
              fieldErrors.orderNumber,
            )}
          />
          <FieldError
            id="withdrawal-order-error"
            message={fieldErrors.orderNumber}
          />
        </ContactFormRow>
        <ContactFormRow
          label={t("motiv")}
          description={t("optionalContextUtil")}
        >
          <textarea
            name="reason"
            maxLength={5000}
            placeholder={t("potiAdaugaDetaliiDespreSolicitare")}
            aria-invalid={Boolean(fieldErrors.reason)}
            aria-describedby={
              fieldErrors.reason ? "withdrawal-reason-error" : undefined
            }
            onInput={() => clearFieldError(setFieldErrors, "reason")}
            className={fieldClassName(
              contactFieldTextareaClassName,
              fieldErrors.reason,
            )}
          />
          <FieldError
            id="withdrawal-reason-error"
            message={fieldErrors.reason}
          />
        </ContactFormRow>
        <ContactFormRow
          label="Confirmare"
          description={t("confirmareObligatorie")}
          isLast
        >
          <span className="flex min-w-0 items-start gap-3 rounded-lg border border-subtle bg-app px-3 py-3 text-xs leading-5 text-muted">
            <input
              name="confirmation"
              type="checkbox"
              required
              aria-invalid={Boolean(fieldErrors.confirmation)}
              aria-describedby={
                fieldErrors.confirmation
                  ? "withdrawal-confirmation-error"
                  : undefined
              }
              onChange={() => clearFieldError(setFieldErrors, "confirmation")}
              className="mt-0.5 h-4 w-4 shrink-0 accent-action"
            />
            <span className="min-w-0 break-words">
              {t("confirmCaDorescRetragereaDin")}
            </span>
          </span>
          <FieldError
            id="withdrawal-confirmation-error"
            message={fieldErrors.confirmation}
          />
        </ContactFormRow>
      </div>
      <ContactRecaptcha
        siteKey={recaptcha.siteKey}
        isResolvingConfig={recaptcha.isResolvingConfig}
        containerRef={recaptcha.containerRef}
        isReady={recaptcha.isReady}
        error={recaptcha.error}
        onScriptLoad={recaptcha.render}
        onScriptError={recaptcha.markScriptError}
      />
      {state.status === "success" ? (
        <button
          key="withdrawal-success-action"
          type="button"
          onClick={handleAnotherWithdrawal}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover sm:w-fit"
        >
          {t("trimiteAltaSolicitare")}
        </button>
      ) : (
        <button
          key="withdrawal-submit-action"
          type="submit"
          disabled={isSubmitButtonDisabled}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60 sm:w-fit"
        >
          {isWithdrawalSubmitting
            ? t("seInregistreaza")
            : t("confirmaRetragerea")}
        </button>
      )}
    </form>
  );
}

type ContentReportFormProps = {
  recaptchaSiteKey: string;
};

export function ContentReportForm({
  recaptchaSiteKey,
}: ContentReportFormProps) {
  const t = useTranslations("compliance");
  const recaptcha = useRecaptcha(recaptchaSiteKey);
  const [state, setState] = useState<FormState>(initialState);
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const [isContentReportSubmitting, setIsContentReportSubmitting] =
    useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<
    SelectedContentReportAttachment[]
  >([]);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const nextAttachmentIdRef = useRef(0);
  const isSubmitButtonDisabled =
    isContentReportSubmitting ||
    recaptcha.isMissing ||
    Boolean(recaptcha.siteKey && recaptcha.error);

  useFormStateToast(state);

  function handleAnotherReport() {
    setIsContentReportSubmitting(false);
    setSelectedAttachments([]);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
    setFieldErrors({});
    setState(initialState);
    recaptcha.reset();
  }

  function clearAttachmentInput() {
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }

  function handleAttachmentChange(event: React.ChangeEvent<HTMLInputElement>) {
    const incomingFiles = Array.from(event.target.files ?? []).filter(
      (file) => file.size > 0,
    );
    if (incomingFiles.length === 0) {
      clearAttachmentInput();
      return;
    }

    const firstInvalidFileMessage = incomingFiles
      .map((file) => validateContentReportAttachments(t, [file]))
      .find((message): message is string => Boolean(message));
    const validIncomingFiles = incomingFiles.filter(
      (file) => !validateContentReportAttachments(t, [file]),
    );
    const remainingSlots =
      contentReportMaxAttachmentFiles - selectedAttachments.length;
    const acceptedFiles = validIncomingFiles.slice(
      0,
      Math.max(0, remainingSlots),
    );
    const hasExceededLimit = validIncomingFiles.length > remainingSlots;

    if (firstInvalidFileMessage) {
      setFieldErrors((currentErrors) => ({
        ...currentErrors,
        attachments: firstInvalidFileMessage,
      }));
      setState({ status: "error", message: firstInvalidFileMessage });
    } else if (hasExceededLimit) {
      const message =
        t("potiAtasaCelMultContentreportmaxattachme", { contentReportMaxAttachmentFiles }) +
        t("amAdaugatLengthDinSelectia", { length: acceptedFiles.length });
      setFieldErrors((currentErrors) => ({
        ...currentErrors,
        attachments: message,
      }));
      setState({
        status: "error",
        message,
      });
    } else {
      clearFieldError(setFieldErrors, "attachments");
      setState(initialState);
    }

    if (acceptedFiles.length === 0) {
      clearAttachmentInput();
      return;
    }

    setSelectedAttachments((currentAttachments) => [
      ...currentAttachments,
      ...acceptedFiles.map((file) => {
        nextAttachmentIdRef.current += 1;
        return {
          id: `${file.name}-${file.size}-${file.lastModified}-${nextAttachmentIdRef.current}`,
          file,
        };
      }),
    ]);
    clearAttachmentInput();
  }

  function removeAttachment(attachmentId: string) {
    setSelectedAttachments((currentAttachments) =>
      currentAttachments.filter((attachment) => attachment.id !== attachmentId),
    );
    clearFieldError(setFieldErrors, "attachments");
    setState(initialState);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isContentReportSubmitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const attachmentFiles = selectedAttachments.map(
      (attachment) => attachment.file,
    );
    const nextFieldErrors = validateContentReportFields(
      t,
      formData,
      attachmentFiles,
    );
    if (hasFieldErrors(nextFieldErrors)) {
      setFieldErrors(nextFieldErrors);
      setState({
        status: "error",
        message: t("corecteazaCampurileMarcateInainteDe"),
      });
      return;
    }
    setFieldErrors({});

    if (recaptcha.isMissing) {
      setState({
        status: "error",
        message:
          t("recaptchaNuEsteConfiguratPe2"),
      });
      return;
    }

    if (recaptcha.error) {
      setState({
        status: "error",
        message: recaptcha.error,
      });
      return;
    }

    if (!recaptcha.isReady) {
      setState({
        status: "error",
        message: t("protectiaAntiSpamIncaSe"),
      });
      return;
    }

    const recaptchaToken = recaptcha.siteKey ? recaptcha.getToken() : "";

    if (recaptcha.siteKey && !recaptchaToken) {
      setState({
        status: "error",
        message: t("confirmaVerificareaAntiSpamInainte"),
      });
      return;
    }

    setIsContentReportSubmitting(true);
    setState({ status: "submitting", message: null });
    try {
      const payload = new FormData();
      payload.set("name", String(formData.get("name") ?? ""));
      payload.set("email", String(formData.get("email") ?? ""));
      payload.set("report_type", String(formData.get("reportType") ?? ""));
      payload.set(
        "content_reference",
        String(formData.get("contentReference") ?? ""),
      );
      payload.set("description", String(formData.get("description") ?? ""));
      payload.set(
        "rights_evidence",
        String(formData.get("rightsEvidence") ?? ""),
      );
      payload.set("declaration", "true");
      payload.set("recaptcha_token", recaptchaToken);
      for (const file of attachmentFiles) {
        payload.append("attachments", file, file.name);
      }

      const response = await postComplianceMultipart(t, "content-report", payload);
      form.reset();
      setSelectedAttachments([]);
      clearAttachmentInput();
      recaptcha.reset();
      setFieldErrors({});
      setState({
        status: "success",
        message:
          response.message ||
          t("sesizareaAFostInregistrataSi"),
        registrationNumber: response.registration_number,
      });
    } catch (error) {
      const serverFieldErrors =
        error instanceof ComplianceRequestError ? error.fieldErrors : {};
      const message =
        error instanceof Error
          ? error.message
          : t("sesizareaNuAPututFi");
      if (hasFieldErrors(serverFieldErrors)) {
        setFieldErrors(serverFieldErrors);
      } else if (isAttachmentErrorMessage(t, message)) {
        setFieldErrors((currentErrors) => ({
          ...currentErrors,
          attachments: message,
        }));
      }
      setState({
        status: "error",
        message:
          hasFieldErrors(serverFieldErrors) ||
          isAttachmentErrorMessage(t, message)
            ? t("corecteazaCampurileMarcateInainteDe")
            : message,
      });
      recaptcha.reset();
    } finally {
      setIsContentReportSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
      <div className="rounded-xl border border-subtle bg-surface">
        <ContactFormRow
          label={t("nume")}
          description={t("cumTePutemIdentifica")}
        >
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            placeholder={t("numeleTau")}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={
              fieldErrors.name ? "content-report-name-error" : undefined
            }
            onInput={() => clearFieldError(setFieldErrors, "name")}
            className={fieldClassName(
              contactFieldInputClassName,
              fieldErrors.name,
            )}
          />
          <FieldError
            id="content-report-name-error"
            message={fieldErrors.name}
          />
        </ContactFormRow>
        <ContactFormRow
          label="E-mail"
          description={t("aiciItiTrimitemConfirmarea")}
        >
          <input
            name="email"
            required
            type="email"
            placeholder="nume@email.ro"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={
              fieldErrors.email ? "content-report-email-error" : undefined
            }
            onInput={() => clearFieldError(setFieldErrors, "email")}
            className={fieldClassName(
              contactFieldInputClassName,
              fieldErrors.email,
            )}
          />
          <FieldError
            id="content-report-email-error"
            message={fieldErrors.email}
          />
        </ContactFormRow>
        <ContactFormRow
          label={t("tip")}
          description={t("alegemFluxulPotrivit")}
        >
          <select
            name="reportType"
            required
            aria-invalid={Boolean(fieldErrors.reportType)}
            aria-describedby={
              fieldErrors.reportType ? "content-report-type-error" : undefined
            }
            onChange={() => clearFieldError(setFieldErrors, "reportType")}
            className={fieldClassName(
              contactFieldInputClassName,
              fieldErrors.reportType,
            )}
          >
            <option value="">{t("alegeTipul")}</option>
            <option value="drepturi_autor">{t("drepturiDeAutor")}</option>
            <option value="date_personale">{t("datePersonale")}</option>
            <option value="continut_incorect">{t("continutIncorect")}</option>
            <option value="altul">{t("altMotiv")}</option>
          </select>
          <FieldError
            id="content-report-type-error"
            message={fieldErrors.reportType}
          />
        </ContactFormRow>
        <ContactFormRow
          label={t("continut")}
          description={t("linkSauIdentificator")}
        >
          <input
            name="contentReference"
            required
            minLength={3}
            maxLength={400}
            placeholder={t("urlTitluProiectSauIdentificator")}
            aria-invalid={Boolean(fieldErrors.contentReference)}
            aria-describedby={
              fieldErrors.contentReference
                ? "content-report-reference-error"
                : undefined
            }
            onInput={() => clearFieldError(setFieldErrors, "contentReference")}
            className={fieldClassName(
              contactFieldInputClassName,
              fieldErrors.contentReference,
            )}
          />
          <FieldError
            id="content-report-reference-error"
            message={fieldErrors.contentReference}
          />
        </ContactFormRow>
        <ContactFormRow
          label={t("descriere")}
          description={t("explicaProblema")}
        >
          <textarea
            name="description"
            required
            minLength={10}
            maxLength={5000}
            placeholder={t("descrieCeTrebuieAnalizat")}
            aria-invalid={Boolean(fieldErrors.description)}
            aria-describedby={
              fieldErrors.description
                ? "content-report-description-error"
                : undefined
            }
            onInput={() => clearFieldError(setFieldErrors, "description")}
            className={fieldClassName(
              contactFieldTextareaClassName,
              fieldErrors.description,
            )}
          />
          <FieldError
            id="content-report-description-error"
            message={fieldErrors.description}
          />
        </ContactFormRow>
        <ContactFormRow
          label={t("dovezi")}
          description={t("linkuriExplicatiiSiDocumente")}
        >
          <div className="grid min-w-0 gap-3">
            <textarea
              name="rightsEvidence"
              maxLength={5000}
              placeholder={t("linkuriSauExplicatiiSuplimentare")}
              aria-invalid={Boolean(fieldErrors.rightsEvidence)}
              aria-describedby={
                fieldErrors.rightsEvidence
                  ? "content-report-evidence-error"
                  : undefined
              }
              onInput={() => clearFieldError(setFieldErrors, "rightsEvidence")}
              className={fieldClassName(
                contactFieldTextareaClassName,
                fieldErrors.rightsEvidence,
              )}
            />
            <FieldError
              id="content-report-evidence-error"
              message={fieldErrors.rightsEvidence}
            />
            <div className="min-w-0 rounded-lg border border-dashed border-subtle bg-app px-3 py-3">
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                accept={contentReportAllowedAttachmentExtensions.join(",")}
                onChange={handleAttachmentChange}
                disabled={
                  selectedAttachments.length >= contentReportMaxAttachmentFiles
                }
                aria-label={t("adaugaDocumente")}
                aria-invalid={Boolean(fieldErrors.attachments)}
                aria-describedby={
                  fieldErrors.attachments
                    ? "content-report-attachments-error"
                    : undefined
                }
                className="sr-only"
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={
                    selectedAttachments.length >= contentReportMaxAttachmentFiles
                  }
                  className="inline-flex w-fit items-center justify-center rounded-md bg-action px-4 py-2 text-xs font-black text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("adaugaDocumente")}
                </button>
                <span className="text-xs font-bold text-muted">
                  {selectedAttachments.length}/{contentReportMaxAttachmentFiles}{" "}
                  documente
                </span>
              </div>
              <span className="mt-3 block text-xs leading-5 text-muted">
                {t("pdfDocDocxTxtRtf")}
              </span>
              <FieldError
                id="content-report-attachments-error"
                message={fieldErrors.attachments}
              />
              {selectedAttachments.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {selectedAttachments.map((attachment) => (
                    <li
                      key={attachment.id}
                      className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-subtle bg-surface px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-bold text-content">
                          {attachment.file.name}
                        </span>
                        <span className="mt-0.5 block text-xs font-semibold text-muted">
                          {formatContentReportFileSize(attachment.file.size)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="shrink-0 rounded-md border border-subtle px-3 py-1.5 text-xs font-black text-muted transition hover:bg-surface-hover hover:text-content"
                      >
                        {t("sterge")}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </ContactFormRow>
        <ContactFormRow
          label={t("declaratie")}
          description={t("confirmareObligatorie")}
          isLast
        >
          <span className="flex min-w-0 items-start gap-3 rounded-lg border border-subtle bg-app px-3 py-3 text-xs leading-5 text-muted">
            <input
              name="declaration"
              type="checkbox"
              required
              aria-invalid={Boolean(fieldErrors.declaration)}
              aria-describedby={
                fieldErrors.declaration
                  ? "content-report-declaration-error"
                  : undefined
              }
              onChange={() => clearFieldError(setFieldErrors, "declaration")}
              className="mt-0.5 h-4 w-4 shrink-0 accent-action"
            />
            <span className="min-w-0 break-words">
              {t("declarCaInformatiileFurnizateSunt")}
            </span>
          </span>
          <FieldError
            id="content-report-declaration-error"
            message={fieldErrors.declaration}
          />
        </ContactFormRow>
      </div>
      <ContactRecaptcha
        siteKey={recaptcha.siteKey}
        isResolvingConfig={recaptcha.isResolvingConfig}
        containerRef={recaptcha.containerRef}
        isReady={recaptcha.isReady}
        error={recaptcha.error}
        onScriptLoad={recaptcha.render}
        onScriptError={recaptcha.markScriptError}
      />
      {state.status === "success" ? (
        <button
          key="content-report-success-action"
          type="button"
          onClick={handleAnotherReport}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover sm:w-fit"
        >
          {t("trimiteAltaSesizare")}
        </button>
      ) : (
        <button
          key="content-report-submit-action"
          type="submit"
          disabled={isSubmitButtonDisabled}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60 sm:w-fit"
        >
          {isContentReportSubmitting ? t("seTrimite") : t("trimiteSesizarea")}
        </button>
      )}
    </form>
  );
}

type CompanyDetailsCardProps = {
  companyData: CompanyData;
};

function displayCompanyValue(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue || /^\[[^\]]+\]$/.test(trimmedValue)) {
    return "-";
  }
  return trimmedValue;
}

export function CompanyDetailsCard({ companyData }: CompanyDetailsCardProps) {
  const t = useTranslations("compliance");
  const rows = [
    [t("operator"), displayCompanyValue(companyData.name)],
    [t("sediuSocial"), displayCompanyValue(companyData.social_location)],
    ["CUI", displayCompanyValue(companyData.cui)],
    [
      t("nrRegistrulComertului"),
      displayCompanyValue(companyData.register_number),
    ],
    ["E-mail", displayCompanyValue(companyData.email)],
    [t("telefon"), displayCompanyValue(companyData.phone)],
  ];

  return (
    <aside className="h-fit rounded-[2rem] border border-subtle bg-surface p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
        {t("dateFirma")}
      </p>
      <dl className="mt-4 grid min-w-0 gap-4 text-sm leading-6">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="font-bold text-content">{label}</dt>
            <dd className="mt-0.5 min-w-0 break-words text-muted">
              {value || "-"}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

type SocialLinksCardProps = {
  companyData: CompanyData;
};

function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

export function SocialLinksCard({ companyData }: SocialLinksCardProps) {
  const t = useTranslations("compliance");
  const links = socialPlatforms.filter(({ key }) => companyData[key]?.trim());

  if (links.length === 0) {
    return null;
  }

  return (
    <aside className="h-fit rounded-[2rem] border border-subtle bg-surface p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
        {t("urmaresteNe")}
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {links.map(({ key, label, Icon }) => (
          <li key={key}>
            <a
              href={companyData[key]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-md border border-subtle bg-app px-4 py-2.5 text-sm font-bold text-content transition hover:bg-surface-hover"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon />
                {label}
              </span>
              <ExternalLinkIcon />
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
